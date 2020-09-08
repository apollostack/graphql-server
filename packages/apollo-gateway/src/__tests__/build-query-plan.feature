Feature: Build Query Plan

Scenario: should not confuse union types with overlapping field names
  Given query
    """
    query {
      body {
        ...on Image {
          attributes {
            url
          }
        }
        ...on Text {
          attributes {
            bold
            text
          }
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "documents",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "body"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Image"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "attributes"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "url"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Text"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "attributes"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "bold"
                        },
                        "arguments": [],
                        "directives": []
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "text"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{body{__typename ...on Image{attributes{url}}...on Text{attributes{bold text}}}}"
      }
    }
    """

Scenario: should use a single fetch when requesting a root field from one service
  Given query
    """
    query {
      me {
        name
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "accounts",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "me"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "arguments": [],
                "directives": [],
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": []
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{me{name}}"
      }
    }
    """

Scenario: should use two independent fetches when requesting root fields from two services
  Given query
    """
    query {
      me {
        name
      }
      topProducts {
        name
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Parallel",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "accounts",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "me"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "name"
                  },
                  "arguments": [],
                  "directives": [],
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": []
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{me{name}}"
        }, {
          "kind": "Sequence",
          "nodes": [{
            "kind": "Fetch",
            "serviceName": "product",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "topProducts"
                },
                "arguments": [],
                "directives": [],
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "__typename"
                    }
                  }, {
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Book"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "__typename"
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "isbn",
                          "loc": {
                            "start": 8,
                            "end": 12
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 8,
                          "end": 12
                        }
                      }]
                    }
                  }, {
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "OutdoorFootball"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "name"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }, {
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "IndoorFootball"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "name"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }, {
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Furniture"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "name"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }, {
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "NightFootball"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "name"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }, {
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "VisuallyImpairedFootball"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "name"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "operation": "{topProducts{__typename ...on Book{__typename isbn}...on OutdoorFootball{name}...on IndoorFootball{name}...on Furniture{name}...on NightFootball{name}...on VisuallyImpairedFootball{name}}}"
          }, {
            "kind": "Flatten",
            "path": ["topProducts", "@"],
            "node": {
              "kind": "Fetch",
              "serviceName": "books",
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Book"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "isbn",
                        "loc": {
                          "start": 8,
                          "end": 12
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 12
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "title",
                        "loc": {
                          "start": 8,
                          "end": 13
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 13
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "year",
                        "loc": {
                          "start": 14,
                          "end": 18
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 14,
                        "end": 18
                      }
                    }]
                  }
                }]
              },
              "variableUsages": {},
              "internalFragments": {},
              "requires": [{
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "isbn"
                }]
              }],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
            }
          }, {
            "kind": "Flatten",
            "path": ["topProducts", "@"],
            "node": {
              "kind": "Fetch",
              "serviceName": "product",
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Book"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }]
              },
              "variableUsages": {},
              "internalFragments": {},
              "requires": [{
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "isbn"
                }, {
                  "kind": "Field",
                  "name": "title"
                }, {
                  "kind": "Field",
                  "name": "year"
                }]
              }],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
            }
          }]
        }]
      }
    }
    """

Scenario: should use a single fetch when requesting multiple root fields from the same service
  Given query
    """
    query {
      topProducts {
        name
      }
      product(upc: "1") {
        name
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "product",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "topProducts"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "__typename"
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Book"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "isbn",
                        "loc": {
                          "start": 8,
                          "end": 12
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 12
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "OutdoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "IndoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Furniture"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "NightFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "VisuallyImpairedFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }]
              }
            }, {
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "product"
              },
              "arguments": [{
                "kind": "Argument",
                "name": {
                  "kind": "Name",
                  "value": "upc"
                },
                "value": {
                  "kind": "StringValue",
                  "value": "1",
                  "block": false
                }
              }],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "__typename"
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Book"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "isbn",
                        "loc": {
                          "start": 8,
                          "end": 12
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 12
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "OutdoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "IndoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Furniture"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "NightFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "VisuallyImpairedFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }]
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{topProducts{__typename ...on Book{__typename isbn}...on OutdoorFootball{name}...on IndoorFootball{name}...on Furniture{name}...on NightFootball{name}...on VisuallyImpairedFootball{name}}product(upc:\"1\"){__typename ...on Book{__typename isbn}...on OutdoorFootball{name}...on IndoorFootball{name}...on Furniture{name}...on NightFootball{name}...on VisuallyImpairedFootball{name}}}"
        }, {
          "kind": "Parallel",
          "nodes": [{
            "kind": "Sequence",
            "nodes": [{
              "kind": "Flatten",
              "path": ["topProducts", "@"],
              "node": {
                "kind": "Fetch",
                "serviceName": "books",
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Book"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "__typename"
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "isbn",
                          "loc": {
                            "start": 8,
                            "end": 12
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 8,
                          "end": 12
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "title",
                          "loc": {
                            "start": 8,
                            "end": 13
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 8,
                          "end": 13
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "year",
                          "loc": {
                            "start": 14,
                            "end": 18
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 14,
                          "end": 18
                        }
                      }]
                    }
                  }]
                },
                "variableUsages": {},
                "internalFragments": {},
                "requires": [{
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [{
                    "kind": "Field",
                    "name": "__typename"
                  }, {
                    "kind": "Field",
                    "name": "isbn"
                  }]
                }],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
              }
            }, {
              "kind": "Flatten",
              "path": ["topProducts", "@"],
              "node": {
                "kind": "Fetch",
                "serviceName": "product",
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Book"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "name"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                },
                "variableUsages": {},
                "internalFragments": {},
                "requires": [{
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [{
                    "kind": "Field",
                    "name": "__typename"
                  }, {
                    "kind": "Field",
                    "name": "isbn"
                  }, {
                    "kind": "Field",
                    "name": "title"
                  }, {
                    "kind": "Field",
                    "name": "year"
                  }]
                }],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
              }
            }]
          }, {
            "kind": "Sequence",
            "nodes": [{
              "kind": "Flatten",
              "path": ["product"],
              "node": {
                "kind": "Fetch",
                "serviceName": "books",
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Book"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "__typename"
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "isbn",
                          "loc": {
                            "start": 8,
                            "end": 12
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 8,
                          "end": 12
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "title",
                          "loc": {
                            "start": 8,
                            "end": 13
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 8,
                          "end": 13
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "year",
                          "loc": {
                            "start": 14,
                            "end": 18
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 14,
                          "end": 18
                        }
                      }]
                    }
                  }]
                },
                "variableUsages": {},
                "internalFragments": {},
                "requires": [{
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [{
                    "kind": "Field",
                    "name": "__typename"
                  }, {
                    "kind": "Field",
                    "name": "isbn"
                  }]
                }],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
              }
            }, {
              "kind": "Flatten",
              "path": ["product"],
              "node": {
                "kind": "Fetch",
                "serviceName": "product",
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Book"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "name"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                },
                "variableUsages": {},
                "internalFragments": {},
                "requires": [{
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [{
                    "kind": "Field",
                    "name": "__typename"
                  }, {
                    "kind": "Field",
                    "name": "isbn"
                  }, {
                    "kind": "Field",
                    "name": "title"
                  }, {
                    "kind": "Field",
                    "name": "year"
                  }]
                }],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
              }
            }]
          }]
        }]
      }
    }
    """

Scenario: should use a single fetch when requesting relationship subfields from the same service
  Given query
    """
    query {
      topReviews {
        body
        author {
          reviews {
            body
          }
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "reviews",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "topReviews"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "body"
                },
                "arguments": [],
                "directives": []
              }, {
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "author"
                },
                "arguments": [],
                "directives": [],
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{topReviews{body author{reviews{body}}}}"
      }
    }
    """

Scenario: should use a single fetch when requesting relationship subfields and provided keys from the same service
  Given query
    """
    query {
      topReviews {
        body
        author {
          id
          reviews {
            body
          }
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "reviews",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "topReviews"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "body"
                },
                "arguments": [],
                "directives": []
              }, {
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "author"
                },
                "arguments": [],
                "directives": [],
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "id"
                    },
                    "arguments": [],
                    "directives": []
                  }, {
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{topReviews{body author{id reviews{body}}}}"
      }
    }
    """

Scenario: when requesting an extension field from another service, it should add the field's representation requirements to the parent selection set and use a dependent fetch
  Given query
  """
  query {
    me {
      name
      reviews {
        body
      }
    }
  }
  """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "accounts",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "me"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "name"
                  },
                  "arguments": [],
                  "directives": [],
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": []
                  }
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "__typename"
                  }
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "id",
                    "loc": {
                      "start": 8,
                      "end": 10
                    }
                  },
                  "arguments": [],
                  "directives": [],
                  "loc": {
                    "start": 8,
                    "end": 10
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{me{name __typename id}}"
        }, {
          "kind": "Flatten",
          "path": ["me"],
          "node": {
            "kind": "Fetch",
            "serviceName": "reviews",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "User"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "requires": [{
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "id"
              }]
            }],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}}}}"
          }
        }]
      }
    }
    """

Scenario: when requesting an extension field from another service, when the parent selection set is empty, should add the field's requirements to the parent selection set and use a dependent fetch
  Given query
    """
    query {
      me {
        reviews {
          body
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "accounts",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "me"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "__typename"
                  }
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "id",
                    "loc": {
                      "start": 8,
                      "end": 10
                    }
                  },
                  "arguments": [],
                  "directives": [],
                  "loc": {
                    "start": 8,
                    "end": 10
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{me{__typename id}}"
        }, {
          "kind": "Flatten",
          "path": ["me"],
          "node": {
            "kind": "Fetch",
            "serviceName": "reviews",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "User"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "requires": [{
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "id"
              }]
            }],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}}}}"
          }
        }]
      }
    }
    """

Scenario: when requesting an extension field from another service, should only add requirements once
  Given query
    """
    query {
      me {
        reviews {
          body
        }
        numberOfReviews
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "accounts",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "me"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "__typename"
                  }
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "id",
                    "loc": {
                      "start": 8,
                      "end": 10
                    }
                  },
                  "arguments": [],
                  "directives": [],
                  "loc": {
                    "start": 8,
                    "end": 10
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{me{__typename id}}"
        }, {
          "kind": "Flatten",
          "path": ["me"],
          "node": {
            "kind": "Fetch",
            "serviceName": "reviews",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "User"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }, {
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "numberOfReviews"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "requires": [{
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "id"
              }]
            }],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}numberOfReviews}}}"
          }
        }]
      }
    }
    """

Scenario: when requesting a composite field with subfields from another service, it should add key fields to the parent selection set and use a dependent fetch
  Given query
    """
    query {
      topReviews {
        body
        author {
          name
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "reviews",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "topReviews"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "body"
                  },
                  "arguments": [],
                  "directives": []
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "author"
                  },
                  "arguments": [],
                  "directives": [],
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "id",
                        "loc": {
                          "start": 8,
                          "end": 10
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 10
                      }
                    }]
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{topReviews{body author{__typename id}}}"
        }, {
          "kind": "Flatten",
          "path": ["topReviews", "@", "author"],
          "node": {
            "kind": "Fetch",
            "serviceName": "accounts",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "User"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "name"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": []
                    }
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "requires": [{
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "id"
              }]
            }],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
          }
        }]
      }
    }
    """

Scenario: when requesting a composite field with subfields from another service, when requesting a field defined in another service which requires a field in the base service, it should add the field provided by base service in first Fetch
  Given query
    """
    query {
      topCars {
        retailPrice
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "product",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "topCars"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "__typename"
                  }
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "id",
                    "loc": {
                      "start": 8,
                      "end": 10
                    }
                  },
                  "arguments": [],
                  "directives": [],
                  "loc": {
                    "start": 8,
                    "end": 10
                  }
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "price",
                    "loc": {
                      "start": 8,
                      "end": 13
                    }
                  },
                  "arguments": [],
                  "directives": [],
                  "loc": {
                    "start": 8,
                    "end": 13
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{topCars{__typename id price}}"
        }, {
          "kind": "Flatten",
          "path": ["topCars", "@"],
          "node": {
            "kind": "Fetch",
            "serviceName": "reviews",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Car"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "retailPrice"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "requires": [{
              "kind": "InlineFragment",
              "typeCondition": "Car",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "id"
              }, {
                "kind": "Field",
                "name": "price"
              }]
            }],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Car{retailPrice}}}"
          }
        }]
      }
    }
    """

Scenario: when requesting a composite field with subfields from another service, when the parent selection set is empty, it should add key fields to the parent selection set and use a dependent fetch
  Given query
    """
    query {
      topReviews {
        author {
          name
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "reviews",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "topReviews"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "author"
                  },
                  "arguments": [],
                  "directives": [],
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "id",
                        "loc": {
                          "start": 8,
                          "end": 10
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 10
                      }
                    }]
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{topReviews{author{__typename id}}}"
        }, {
          "kind": "Flatten",
          "path": ["topReviews", "@", "author"],
          "node": {
            "kind": "Fetch",
            "serviceName": "accounts",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "User"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "name"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": []
                    }
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "requires": [{
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "id"
              }]
            }],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
          }
        }]
      }
    }
    """

Scenario: when requesting a relationship field with extension subfields from a different service, it should first fetch the object using a key from the base service and then pass through the requirements
  Given query
    """
    query {
      topReviews {
        author {
          birthDate
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "reviews",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "topReviews"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "author"
                  },
                  "arguments": [],
                  "directives": [],
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "id",
                        "loc": {
                          "start": 8,
                          "end": 10
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 10
                      }
                    }]
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{topReviews{author{__typename id}}}"
        }, {
          "kind": "Flatten",
          "path": ["topReviews", "@", "author"],
          "node": {
            "kind": "Fetch",
            "serviceName": "accounts",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "User"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "birthDate"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "requires": [{
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "id"
              }]
            }],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{birthDate}}}"
          }
        }]
      }
    }
    """

Scenario: for abstract types, it should add __typename when fetching objects of an interface type from a service
  Given query
    """
    query {
      topProducts {
        price
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "product",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "topProducts"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Book"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "price"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "OutdoorFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "price"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "IndoorFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "price"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Furniture"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "price"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "NightFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "price"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "VisuallyImpairedFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "price"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{topProducts{__typename ...on Book{price}...on OutdoorFootball{price}...on IndoorFootball{price}...on Furniture{price}...on NightFootball{price}...on VisuallyImpairedFootball{price}}}"
      }
    }
    """

Scenario: should break up when traversing an extension field on an interface type from a service
  Given query
    """
    query {
      topProducts {
        price
        reviews {
          body
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "product",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "topProducts"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "__typename"
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Book"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "isbn",
                        "loc": {
                          "start": 8,
                          "end": 12
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 12
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "OutdoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "upc",
                        "loc": {
                          "start": 8,
                          "end": 11
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 11
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "IndoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "upc",
                        "loc": {
                          "start": 8,
                          "end": 11
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 11
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Furniture"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "upc",
                        "loc": {
                          "start": 8,
                          "end": 11
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 11
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "NightFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "upc",
                        "loc": {
                          "start": 8,
                          "end": 11
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 11
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "VisuallyImpairedFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "__typename"
                      }
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "upc",
                        "loc": {
                          "start": 8,
                          "end": 11
                        }
                      },
                      "arguments": [],
                      "directives": [],
                      "loc": {
                        "start": 8,
                        "end": 11
                      }
                    }]
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{topProducts{__typename ...on Book{price __typename isbn}...on OutdoorFootball{price __typename upc}...on IndoorFootball{price __typename upc}...on Furniture{price __typename upc}...on NightFootball{price __typename upc}...on VisuallyImpairedFootball{price __typename upc}}}"
        }, {
          "kind": "Flatten",
          "path": ["topProducts", "@"],
          "node": {
            "kind": "Fetch",
            "serviceName": "reviews",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Book"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "OutdoorFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "IndoorFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Furniture"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "NightFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "VisuallyImpairedFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "reviews"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "body"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "requires": [{
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "isbn"
              }]
            }, {
              "kind": "InlineFragment",
              "typeCondition": "OutdoorFootball",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "upc"
              }]
            }, {
              "kind": "InlineFragment",
              "typeCondition": "IndoorFootball",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "upc"
              }]
            }, {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "upc"
              }]
            }, {
              "kind": "InlineFragment",
              "typeCondition": "NightFootball",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "upc"
              }]
            }, {
              "kind": "InlineFragment",
              "typeCondition": "VisuallyImpairedFootball",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "upc"
              }]
            }],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{body}}...on OutdoorFootball{reviews{body}}...on IndoorFootball{reviews{body}}...on Furniture{reviews{body}}...on NightFootball{reviews{body}}...on VisuallyImpairedFootball{reviews{body}}}}"
          }
        }]
      }
    }
    """

Scenario: interface fragments should expand into possible types only
  Given query
    """
    query {
      books {
        ... on Product {
          name
          ... on Furniture {
            upc
          }
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "books",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "books"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "__typename"
                  }
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "isbn",
                    "loc": {
                      "start": 8,
                      "end": 12
                    }
                  },
                  "arguments": [],
                  "directives": [],
                  "loc": {
                    "start": 8,
                    "end": 12
                  }
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "title",
                    "loc": {
                      "start": 8,
                      "end": 13
                    }
                  },
                  "arguments": [],
                  "directives": [],
                  "loc": {
                    "start": 8,
                    "end": 13
                  }
                }, {
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "year",
                    "loc": {
                      "start": 14,
                      "end": 18
                    }
                  },
                  "arguments": [],
                  "directives": [],
                  "loc": {
                    "start": 14,
                    "end": 18
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{books{__typename isbn title year}}"
        }, {
          "kind": "Flatten",
          "path": ["books", "@"],
          "node": {
            "kind": "Fetch",
            "serviceName": "product",
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Book"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "name"
                    },
                    "arguments": [],
                    "directives": []
                  }]
                }
              }]
            },
            "variableUsages": {},
            "internalFragments": {},
            "requires": [{
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [{
                "kind": "Field",
                "name": "__typename"
              }, {
                "kind": "Field",
                "name": "isbn"
              }, {
                "kind": "Field",
                "name": "title"
              }, {
                "kind": "Field",
                "name": "year"
              }]
            }],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
          }
        }]
      }
    }
    """

Scenario: interface inside interface should expand into possible types only
  Given query
    """
    query {
      product(upc: "") {
        details {
          country
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "product",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "product"
            },
            "arguments": [{
              "kind": "Argument",
              "name": {
                "kind": "Name",
                "value": "upc"
              },
              "value": {
                "kind": "StringValue",
                "value": "",
                "block": false
              }
            }],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Book"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "details"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "country"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "OutdoorFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "details"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "__typename"
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "country"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "IndoorFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "details"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "__typename"
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "country"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Furniture"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "details"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "country"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "NightFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "details"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "__typename"
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "country"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "VisuallyImpairedFootball"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "details"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "__typename"
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "country"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{product(upc:\"\"){__typename ...on Book{details{country}}...on OutdoorFootball{details{__typename country}}...on IndoorFootball{details{__typename country}}...on Furniture{details{country}}...on NightFootball{details{__typename country}}...on VisuallyImpairedFootball{details{__typename country}}}}"
      }
    }
    """

Scenario: experimental compression to downstream services should generate fragments internally to downstream requests
  Given query
    """
    query {
      topReviews {
        body
        author
        product {
          name
          price
          details {
            country
          }
        }
      }
    }
    """
  When using autofragmentization
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "reviews",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "topReviews"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "FragmentSpread",
                  "name": {
                    "kind": "Name",
                    "value": "__QueryPlanFragment_1__"
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{topReviews{...__QueryPlanFragment_1__}}fragment __QueryPlanFragment_1__ on Review{body author product{...__QueryPlanFragment_0__}}fragment __QueryPlanFragment_0__ on Product{__typename ...on Book{__typename isbn}...on OutdoorFootball{__typename upc}...on IndoorFootball{__typename upc}...on Furniture{__typename upc}...on NightFootball{__typename upc}...on VisuallyImpairedFootball{__typename upc}}"
        }, {
          "kind": "Parallel",
          "nodes": [{
            "kind": "Sequence",
            "nodes": [{
              "kind": "Flatten",
              "path": ["topReviews", "@", "product"],
              "node": {
                "kind": "Fetch",
                "serviceName": "books",
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Book"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "__typename"
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "isbn",
                          "loc": {
                            "start": 8,
                            "end": 12
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 8,
                          "end": 12
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "title",
                          "loc": {
                            "start": 8,
                            "end": 13
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 8,
                          "end": 13
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "year",
                          "loc": {
                            "start": 14,
                            "end": 18
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 14,
                          "end": 18
                        }
                      }]
                    }
                  }]
                },
                "variableUsages": {},
                "internalFragments": {},
                "requires": [{
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [{
                    "kind": "Field",
                    "name": "__typename"
                  }, {
                    "kind": "Field",
                    "name": "isbn"
                  }]
                }],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
              }
            }, {
              "kind": "Flatten",
              "path": ["topReviews", "@", "product"],
              "node": {
                "kind": "Fetch",
                "serviceName": "product",
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Book"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "name"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                },
                "variableUsages": {},
                "internalFragments": {},
                "requires": [{
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [{
                    "kind": "Field",
                    "name": "__typename"
                  }, {
                    "kind": "Field",
                    "name": "isbn"
                  }, {
                    "kind": "Field",
                    "name": "title"
                  }, {
                    "kind": "Field",
                    "name": "year"
                  }]
                }],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
              }
            }]
          }, {
            "kind": "Flatten",
            "path": ["topReviews", "@", "product"],
            "node": {
              "kind": "Fetch",
              "serviceName": "product",
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "OutdoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "IndoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Furniture"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "NightFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "VisuallyImpairedFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Book"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }]
              },
              "variableUsages": {},
              "internalFragments": {},
              "requires": [{
                "kind": "InlineFragment",
                "typeCondition": "OutdoorFootball",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "IndoorFootball",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "Furniture",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "NightFootball",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "VisuallyImpairedFootball",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "isbn"
                }]
              }],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on OutdoorFootball{name price details{__typename country}}...on IndoorFootball{name price details{__typename country}}...on Furniture{name price details{country}}...on NightFootball{name price details{__typename country}}...on VisuallyImpairedFootball{name price details{__typename country}}...on Book{price details{country}}}}"
            }
          }]
        }]
      }
    }
    """

Scenario: experimental compression to downstream services shouldn't generate fragments for selection sets of length 2 or less
  Given query
    """
    query {
      topReviews {
        body
        author
      }
    }
    """
  When using autofragmentization
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "reviews",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "topReviews"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "body"
                },
                "arguments": [],
                "directives": []
              }, {
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "author"
                },
                "arguments": [],
                "directives": [],
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": []
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{topReviews{body author}}"
      }
    }
    """

Scenario: experimental compression to downstream services should generate fragments for selection sets of length 3 or greater
  Given query
    """
    query {
      topReviews {
        id
        body
        author
      }
    }
    """
  When using autofragmentization
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "reviews",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "topReviews"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "FragmentSpread",
                "name": {
                  "kind": "Name",
                  "value": "__QueryPlanFragment_0__"
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{topReviews{...__QueryPlanFragment_0__}}fragment __QueryPlanFragment_0__ on Review{id body author}"
      }
    }
    """

Scenario: experimental compression to downstream services should generate fragments correctly when aliases are used
  Given query
    """
    query {
      reviews: topReviews {
        content: body
        author
        product {
          name
          cost: price
          details {
            origin: country
          }
        }
      }
    }
    """
  When using autofragmentization
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Sequence",
        "nodes": [{
          "kind": "Fetch",
          "serviceName": "reviews",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "alias": {
                "kind": "Name",
                "value": "reviews"
              },
              "name": {
                "kind": "Name",
                "value": "topReviews"
              },
              "arguments": [],
              "directives": [],
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "FragmentSpread",
                  "name": {
                    "kind": "Name",
                    "value": "__QueryPlanFragment_1__"
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "operation": "{reviews:topReviews{...__QueryPlanFragment_1__}}fragment __QueryPlanFragment_1__ on Review{content:body author product{...__QueryPlanFragment_0__}}fragment __QueryPlanFragment_0__ on Product{__typename ...on Book{__typename isbn}...on OutdoorFootball{__typename upc}...on IndoorFootball{__typename upc}...on Furniture{__typename upc}...on NightFootball{__typename upc}...on VisuallyImpairedFootball{__typename upc}}"
        }, {
          "kind": "Parallel",
          "nodes": [{
            "kind": "Sequence",
            "nodes": [{
              "kind": "Flatten",
              "path": ["reviews", "@", "product"],
              "node": {
                "kind": "Fetch",
                "serviceName": "books",
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Book"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "__typename"
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "isbn",
                          "loc": {
                            "start": 8,
                            "end": 12
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 8,
                          "end": 12
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "title",
                          "loc": {
                            "start": 8,
                            "end": 13
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 8,
                          "end": 13
                        }
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "year",
                          "loc": {
                            "start": 14,
                            "end": 18
                          }
                        },
                        "arguments": [],
                        "directives": [],
                        "loc": {
                          "start": 14,
                          "end": 18
                        }
                      }]
                    }
                  }]
                },
                "variableUsages": {},
                "internalFragments": {},
                "requires": [{
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [{
                    "kind": "Field",
                    "name": "__typename"
                  }, {
                    "kind": "Field",
                    "name": "isbn"
                  }]
                }],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
              }
            }, {
              "kind": "Flatten",
              "path": ["reviews", "@", "product"],
              "node": {
                "kind": "Fetch",
                "serviceName": "product",
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "InlineFragment",
                    "typeCondition": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "Book"
                      }
                    },
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "name"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                },
                "variableUsages": {},
                "internalFragments": {},
                "requires": [{
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [{
                    "kind": "Field",
                    "name": "__typename"
                  }, {
                    "kind": "Field",
                    "name": "isbn"
                  }, {
                    "kind": "Field",
                    "name": "title"
                  }, {
                    "kind": "Field",
                    "name": "year"
                  }]
                }],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
              }
            }]
          }, {
            "kind": "Flatten",
            "path": ["reviews", "@", "product"],
            "node": {
              "kind": "Fetch",
              "serviceName": "product",
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "OutdoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "alias": {
                        "kind": "Name",
                        "value": "cost"
                      },
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "Field",
                          "alias": {
                            "kind": "Name",
                            "value": "origin"
                          },
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "IndoorFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "alias": {
                        "kind": "Name",
                        "value": "cost"
                      },
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "Field",
                          "alias": {
                            "kind": "Name",
                            "value": "origin"
                          },
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Furniture"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "alias": {
                        "kind": "Name",
                        "value": "cost"
                      },
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "alias": {
                            "kind": "Name",
                            "value": "origin"
                          },
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "NightFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "alias": {
                        "kind": "Name",
                        "value": "cost"
                      },
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "Field",
                          "alias": {
                            "kind": "Name",
                            "value": "origin"
                          },
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "VisuallyImpairedFootball"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "name"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "alias": {
                        "kind": "Name",
                        "value": "cost"
                      },
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "Field",
                          "alias": {
                            "kind": "Name",
                            "value": "origin"
                          },
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }, {
                  "kind": "InlineFragment",
                  "typeCondition": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Book"
                    }
                  },
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "alias": {
                        "kind": "Name",
                        "value": "cost"
                      },
                      "name": {
                        "kind": "Name",
                        "value": "price"
                      },
                      "arguments": [],
                      "directives": []
                    }, {
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "details"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "alias": {
                            "kind": "Name",
                            "value": "origin"
                          },
                          "name": {
                            "kind": "Name",
                            "value": "country"
                          },
                          "arguments": [],
                          "directives": []
                        }]
                      }
                    }]
                  }
                }]
              },
              "variableUsages": {},
              "internalFragments": {},
              "requires": [{
                "kind": "InlineFragment",
                "typeCondition": "OutdoorFootball",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "IndoorFootball",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "Furniture",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "NightFootball",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "VisuallyImpairedFootball",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "upc"
                }]
              }, {
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [{
                  "kind": "Field",
                  "name": "__typename"
                }, {
                  "kind": "Field",
                  "name": "isbn"
                }]
              }],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on OutdoorFootball{name cost:price details{__typename origin:country}}...on IndoorFootball{name cost:price details{__typename origin:country}}...on Furniture{name cost:price details{origin:country}}...on NightFootball{name cost:price details{__typename origin:country}}...on VisuallyImpairedFootball{name cost:price details{__typename origin:country}}...on Book{cost:price details{origin:country}}}}"
            }
          }]
        }]
      }
    }
    """

Scenario: should properly expand nested unions with inline fragments
  Given query
    """
    query {
      body {
        ... on Image {
          ... on Body {
            ... on Image {
              attributes {
                url
              }
            }
            ... on Text {
              attributes {
                bold
                text
              }
            }
          }
        }
        ... on Text {
          attributes {
            bold
          }
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "documents",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "body"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Image"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "attributes"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "url"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Text"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "attributes"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "bold"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{body{__typename ...on Image{attributes{url}}...on Text{attributes{bold}}}}"
      }
    }
    """

Scenario: deduplicates fields / selections regardless of adjacency and type condition nesting for inline fragments
  Given query
    """
    query {
      body {
        ... on Image {
          ... on Text {
            attributes {
              bold
            }
          }
        }
        ... on Body {
          ... on Text {
            attributes {
              bold
              text
            }
          }
        }
        ... on Text {
          attributes {
            bold
            text
          }
        }
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "documents",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "body"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Text"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "attributes"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "bold"
                        },
                        "arguments": [],
                        "directives": []
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "text"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{body{__typename ...on Text{attributes{bold text}}}}"
      }
    }
    """

Scenario: deduplicates fields / selections regardless of adjacency and type condition nesting for named fragment spreads
  Given query
    """
    fragment TextFragment on Text {
      attributes {
        bold
        text
      }
    }

    query {
      body {
        ... on Image {
          ...TextFragment
        }
        ... on Body {
          ...TextFragment
        }
        ...TextFragment
      }
    }
    """
  Then query plan
    """
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "documents",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "body"
            },
            "arguments": [],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Text"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "attributes"
                    },
                    "arguments": [],
                    "directives": [],
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [{
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "bold"
                        },
                        "arguments": [],
                        "directives": []
                      }, {
                        "kind": "Field",
                        "name": {
                          "kind": "Name",
                          "value": "text"
                        },
                        "arguments": [],
                        "directives": []
                      }]
                    }
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {},
        "internalFragments": {},
        "operation": "{body{__typename ...on Text{attributes{bold text}}}}"
      }
    }
    """

Scenario: supports basic, single-service mutation
  Given query
  """
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      id
    }
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Fetch",
      "serviceName": "accounts",
      "selectionSet": {
        "kind": "SelectionSet",
        "selections": [{
          "kind": "Field",
          "name": {
            "kind": "Name",
            "value": "login"
          },
          "arguments": [{
            "kind": "Argument",
            "name": {
              "kind": "Name",
              "value": "username"
            },
            "value": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "username"
              }
            }
          }, {
            "kind": "Argument",
            "name": {
              "kind": "Name",
              "value": "password"
            },
            "value": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "password"
              }
            }
          }],
          "directives": [],
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "Field",
              "name": {
                "kind": "Name",
                "value": "id"
              },
              "arguments": [],
              "directives": []
            }]
          }
        }]
      },
      "variableUsages": {
        "username": {
          "kind": "VariableDefinition",
          "variable": {
            "kind": "Variable",
            "name": {
              "kind": "Name",
              "value": "username"
            }
          },
          "type": {
            "kind": "NonNullType",
            "type": {
              "kind": "NamedType",
              "name": {
                "kind": "Name",
                "value": "String"
              }
            }
          },
          "directives": []
        },
        "password": {
          "kind": "VariableDefinition",
          "variable": {
            "kind": "Variable",
            "name": {
              "kind": "Name",
              "value": "password"
            }
          },
          "type": {
            "kind": "NonNullType",
            "type": {
              "kind": "NamedType",
              "name": {
                "kind": "Name",
                "value": "String"
              }
            }
          },
          "directives": []
        }
      },
      "internalFragments": {},
      "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){id}}"
    }
  }
  """

# ported from: https://github.com/apollographql/apollo-server/blob/main/packages/apollo-gateway/src/__tests__/integration/mutations.test.ts#L13
Scenario: supports mutations with a cross-service request
  Given query
  """
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      reviews {
        product {
          upc
        }
      }
    }
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Sequence",
      "nodes": [{
        "kind": "Fetch",
        "serviceName": "accounts",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "login"
            },
            "arguments": [{
              "kind": "Argument",
              "name": {
                "kind": "Name",
                "value": "username"
              },
              "value": {
                "kind": "Variable",
                "name": {
                  "kind": "Name",
                  "value": "username"
                }
              }
            }, {
              "kind": "Argument",
              "name": {
                "kind": "Name",
                "value": "password"
              },
              "value": {
                "kind": "Variable",
                "name": {
                  "kind": "Name",
                  "value": "password"
                }
              }
            }],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "id",
                  "loc": {
                    "start": 8,
                    "end": 10
                  }
                },
                "arguments": [],
                "directives": [],
                "loc": {
                  "start": 8,
                  "end": 10
                }
              }]
            }
          }]
        },
        "variableUsages": {
          "username": {
            "kind": "VariableDefinition",
            "variable": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "username"
              }
            },
            "type": {
              "kind": "NonNullType",
              "type": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "String"
                }
              }
            },
            "directives": []
          },
          "password": {
            "kind": "VariableDefinition",
            "variable": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "password"
              }
            },
            "type": {
              "kind": "NonNullType",
              "type": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "String"
                }
              }
            },
            "directives": []
          }
        },
        "internalFragments": {},
        "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){__typename id}}"
      }, {
        "kind": "Flatten",
        "path": ["login"],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "InlineFragment",
              "typeCondition": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "User"
                }
              },
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "reviews"
                  },
                  "arguments": [],
                  "directives": [],
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "product"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "Book"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "__typename"
                              }
                            }, {
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "isbn",
                                "loc": {
                                  "start": 8,
                                  "end": 12
                                }
                              },
                              "arguments": [],
                              "directives": [],
                              "loc": {
                                "start": 8,
                                "end": 12
                              }
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "OutdoorFootball"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "IndoorFootball"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "Furniture"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "NightFootball"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "VisuallyImpairedFootball"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }]
                      }
                    }]
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "requires": [{
            "kind": "InlineFragment",
            "typeCondition": "User",
            "selections": [{
              "kind": "Field",
              "name": "__typename"
            }, {
              "kind": "Field",
              "name": "id"
            }]
          }],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on OutdoorFootball{upc}...on IndoorFootball{upc}...on Furniture{upc}...on NightFootball{upc}...on VisuallyImpairedFootball{upc}}}}}}"
        }
      }, {
        "kind": "Flatten",
        "path": ["login", "reviews", "@", "product"],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "InlineFragment",
              "typeCondition": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "Book"
                }
              },
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "upc"
                  },
                  "arguments": [],
                  "directives": []
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "requires": [{
            "kind": "InlineFragment",
            "typeCondition": "Book",
            "selections": [{
              "kind": "Field",
              "name": "__typename"
            }, {
              "kind": "Field",
              "name": "isbn"
            }]
          }],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}"
        }
      }]
    }
  }
  """

# ported from: https://github.com/apollographql/apollo-server/blob/main/packages/apollo-gateway/src/__tests__/integration/mutations.test.ts#L48
Scenario: returning across service boundaries
  Given query
  """
  mutation Review($upc: String!, $body: String!) {
    reviewProduct(upc: $upc, body: $body) {
      ... on Furniture {
        name
      }
    }
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Sequence",
      "nodes": [{
        "kind": "Fetch",
        "serviceName": "reviews",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "reviewProduct"
            },
            "arguments": [{
              "kind": "Argument",
              "name": {
                "kind": "Name",
                "value": "upc"
              },
              "value": {
                "kind": "Variable",
                "name": {
                  "kind": "Name",
                  "value": "upc"
                }
              }
            }, {
              "kind": "Argument",
              "name": {
                "kind": "Name",
                "value": "body"
              },
              "value": {
                "kind": "Variable",
                "name": {
                  "kind": "Name",
                  "value": "body"
                }
              }
            }],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Furniture"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "__typename"
                    }
                  }, {
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "upc",
                      "loc": {
                        "start": 8,
                        "end": 11
                      }
                    },
                    "arguments": [],
                    "directives": [],
                    "loc": {
                      "start": 8,
                      "end": 11
                    }
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {
          "upc": {
            "kind": "VariableDefinition",
            "variable": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "upc"
              }
            },
            "type": {
              "kind": "NonNullType",
              "type": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "String"
                }
              }
            },
            "directives": []
          },
          "body": {
            "kind": "VariableDefinition",
            "variable": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "body"
              }
            },
            "type": {
              "kind": "NonNullType",
              "type": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "String"
                }
              }
            },
            "directives": []
          }
        },
        "internalFragments": {},
        "operation": "mutation($upc:String!$body:String!){reviewProduct(upc:$upc body:$body){__typename ...on Furniture{__typename upc}}}"
      }, {
        "kind": "Flatten",
        "path": ["reviewProduct"],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "InlineFragment",
              "typeCondition": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "Furniture"
                }
              },
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "name"
                  },
                  "arguments": [],
                  "directives": []
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "requires": [{
            "kind": "InlineFragment",
            "typeCondition": "Furniture",
            "selections": [{
              "kind": "Field",
              "name": "__typename"
            }, {
              "kind": "Field",
              "name": "upc"
            }]
          }],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}"
        }
      }]
    }
  }
  """

# ported from: https://github.com/apollographql/apollo-server/blob/main/packages/apollo-gateway/src/__tests__/integration/mutations.test.ts#L75
Scenario: supports multiple root mutations
  Given query
  """
  mutation LoginAndReview(
    $username: String!
    $password: String!
    $upc: String!
    $body: String!
  ) {
    login(username: $username, password: $password) {
      reviews {
        product {
          upc
        }
      }
    }
    reviewProduct(upc: $upc, body: $body) {
      ... on Furniture {
        name
      }
    }
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Sequence",
      "nodes": [{
        "kind": "Fetch",
        "serviceName": "accounts",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "login"
            },
            "arguments": [{
              "kind": "Argument",
              "name": {
                "kind": "Name",
                "value": "username"
              },
              "value": {
                "kind": "Variable",
                "name": {
                  "kind": "Name",
                  "value": "username"
                }
              }
            }, {
              "kind": "Argument",
              "name": {
                "kind": "Name",
                "value": "password"
              },
              "value": {
                "kind": "Variable",
                "name": {
                  "kind": "Name",
                  "value": "password"
                }
              }
            }],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "id",
                  "loc": {
                    "start": 8,
                    "end": 10
                  }
                },
                "arguments": [],
                "directives": [],
                "loc": {
                  "start": 8,
                  "end": 10
                }
              }]
            }
          }]
        },
        "variableUsages": {
          "username": {
            "kind": "VariableDefinition",
            "variable": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "username"
              }
            },
            "type": {
              "kind": "NonNullType",
              "type": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "String"
                }
              }
            },
            "directives": []
          },
          "password": {
            "kind": "VariableDefinition",
            "variable": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "password"
              }
            },
            "type": {
              "kind": "NonNullType",
              "type": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "String"
                }
              }
            },
            "directives": []
          }
        },
        "internalFragments": {},
        "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){__typename id}}"
      }, {
        "kind": "Flatten",
        "path": ["login"],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "InlineFragment",
              "typeCondition": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "User"
                }
              },
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "reviews"
                  },
                  "arguments": [],
                  "directives": [],
                  "selectionSet": {
                    "kind": "SelectionSet",
                    "selections": [{
                      "kind": "Field",
                      "name": {
                        "kind": "Name",
                        "value": "product"
                      },
                      "arguments": [],
                      "directives": [],
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [{
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "__typename"
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "Book"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "__typename"
                              }
                            }, {
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "isbn",
                                "loc": {
                                  "start": 8,
                                  "end": 12
                                }
                              },
                              "arguments": [],
                              "directives": [],
                              "loc": {
                                "start": 8,
                                "end": 12
                              }
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "OutdoorFootball"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "IndoorFootball"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "Furniture"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "NightFootball"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }, {
                          "kind": "InlineFragment",
                          "typeCondition": {
                            "kind": "NamedType",
                            "name": {
                              "kind": "Name",
                              "value": "VisuallyImpairedFootball"
                            }
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [{
                              "kind": "Field",
                              "name": {
                                "kind": "Name",
                                "value": "upc"
                              },
                              "arguments": [],
                              "directives": []
                            }]
                          }
                        }]
                      }
                    }]
                  }
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "requires": [{
            "kind": "InlineFragment",
            "typeCondition": "User",
            "selections": [{
              "kind": "Field",
              "name": "__typename"
            }, {
              "kind": "Field",
              "name": "id"
            }]
          }],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on OutdoorFootball{upc}...on IndoorFootball{upc}...on Furniture{upc}...on NightFootball{upc}...on VisuallyImpairedFootball{upc}}}}}}"
        }
      }, {
        "kind": "Flatten",
        "path": ["login", "reviews", "@", "product"],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "InlineFragment",
              "typeCondition": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "Book"
                }
              },
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "upc"
                  },
                  "arguments": [],
                  "directives": []
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "requires": [{
            "kind": "InlineFragment",
            "typeCondition": "Book",
            "selections": [{
              "kind": "Field",
              "name": "__typename"
            }, {
              "kind": "Field",
              "name": "isbn"
            }]
          }],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}"
        }
      }, {
        "kind": "Fetch",
        "serviceName": "reviews",
        "selectionSet": {
          "kind": "SelectionSet",
          "selections": [{
            "kind": "Field",
            "name": {
              "kind": "Name",
              "value": "reviewProduct"
            },
            "arguments": [{
              "kind": "Argument",
              "name": {
                "kind": "Name",
                "value": "upc"
              },
              "value": {
                "kind": "Variable",
                "name": {
                  "kind": "Name",
                  "value": "upc"
                }
              }
            }, {
              "kind": "Argument",
              "name": {
                "kind": "Name",
                "value": "body"
              },
              "value": {
                "kind": "Variable",
                "name": {
                  "kind": "Name",
                  "value": "body"
                }
              }
            }],
            "directives": [],
            "selectionSet": {
              "kind": "SelectionSet",
              "selections": [{
                "kind": "Field",
                "name": {
                  "kind": "Name",
                  "value": "__typename"
                }
              }, {
                "kind": "InlineFragment",
                "typeCondition": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "Furniture"
                  }
                },
                "selectionSet": {
                  "kind": "SelectionSet",
                  "selections": [{
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "__typename"
                    }
                  }, {
                    "kind": "Field",
                    "name": {
                      "kind": "Name",
                      "value": "upc",
                      "loc": {
                        "start": 8,
                        "end": 11
                      }
                    },
                    "arguments": [],
                    "directives": [],
                    "loc": {
                      "start": 8,
                      "end": 11
                    }
                  }]
                }
              }]
            }
          }]
        },
        "variableUsages": {
          "upc": {
            "kind": "VariableDefinition",
            "variable": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "upc"
              }
            },
            "type": {
              "kind": "NonNullType",
              "type": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "String"
                }
              }
            },
            "directives": []
          },
          "body": {
            "kind": "VariableDefinition",
            "variable": {
              "kind": "Variable",
              "name": {
                "kind": "Name",
                "value": "body"
              }
            },
            "type": {
              "kind": "NonNullType",
              "type": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "String"
                }
              }
            },
            "directives": []
          }
        },
        "internalFragments": {},
        "operation": "mutation($upc:String!$body:String!){reviewProduct(upc:$upc body:$body){__typename ...on Furniture{__typename upc}}}"
      }, {
        "kind": "Flatten",
        "path": ["reviewProduct"],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "selectionSet": {
            "kind": "SelectionSet",
            "selections": [{
              "kind": "InlineFragment",
              "typeCondition": {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "Furniture"
                }
              },
              "selectionSet": {
                "kind": "SelectionSet",
                "selections": [{
                  "kind": "Field",
                  "name": {
                    "kind": "Name",
                    "value": "name"
                  },
                  "arguments": [],
                  "directives": []
                }]
              }
            }]
          },
          "variableUsages": {},
          "internalFragments": {},
          "requires": [{
            "kind": "InlineFragment",
            "typeCondition": "Furniture",
            "selections": [{
              "kind": "Field",
              "name": "__typename"
            }, {
              "kind": "Field",
              "name": "upc"
            }]
          }],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}"
        }
      }]
    }
  }
  """

# ported from: https://github.com/apollographql/apollo-server/blob/main/packages/apollo-gateway/src/__tests__/integration/mutations.test.ts#L136
Scenario: multiple root mutations with correct service order
  Given query
  """
  mutation LoginAndReview(
    $upc: String!
    $body: String!
    $updatedReview: UpdateReviewInput!
    $username: String!
    $password: String!
    $reviewId: ID!
  ) {
    reviewProduct(upc: $upc, body: $body) {
      ... on Furniture {
        upc
      }
    }
    updateReview(review: $updatedReview) {
      id
      body
    }
    login(username: $username, password: $password) {
      reviews {
        product {
          upc
        }
      }
    }
    deleteReview(id: $reviewId)
  }
  """
  Then query plan
  """
  {
	"kind": "QueryPlan",
	"node": {
		"kind": "Sequence",
		"nodes": [{
			"kind": "Fetch",
			"serviceName": "reviews",
			"selectionSet": {
				"kind": "SelectionSet",
				"selections": [{
					"kind": "Field",
					"name": {
						"kind": "Name",
						"value": "reviewProduct"
					},
					"arguments": [{
						"kind": "Argument",
						"name": {
							"kind": "Name",
							"value": "upc"
						},
						"value": {
							"kind": "Variable",
							"name": {
								"kind": "Name",
								"value": "upc"
							}
						}
					}, {
						"kind": "Argument",
						"name": {
							"kind": "Name",
							"value": "body"
						},
						"value": {
							"kind": "Variable",
							"name": {
								"kind": "Name",
								"value": "body"
							}
						}
					}],
					"directives": [],
					"selectionSet": {
						"kind": "SelectionSet",
						"selections": [{
							"kind": "Field",
							"name": {
								"kind": "Name",
								"value": "__typename"
							}
						}, {
							"kind": "InlineFragment",
							"typeCondition": {
								"kind": "NamedType",
								"name": {
									"kind": "Name",
									"value": "Furniture"
								}
							},
							"selectionSet": {
								"kind": "SelectionSet",
								"selections": [{
									"kind": "Field",
									"name": {
										"kind": "Name",
										"value": "upc"
									},
									"arguments": [],
									"directives": []
								}]
							}
						}]
					}
				}, {
					"kind": "Field",
					"name": {
						"kind": "Name",
						"value": "updateReview"
					},
					"arguments": [{
						"kind": "Argument",
						"name": {
							"kind": "Name",
							"value": "review"
						},
						"value": {
							"kind": "Variable",
							"name": {
								"kind": "Name",
								"value": "updatedReview"
							}
						}
					}],
					"directives": [],
					"selectionSet": {
						"kind": "SelectionSet",
						"selections": [{
							"kind": "Field",
							"name": {
								"kind": "Name",
								"value": "id"
							},
							"arguments": [],
							"directives": []
						}, {
							"kind": "Field",
							"name": {
								"kind": "Name",
								"value": "body"
							},
							"arguments": [],
							"directives": []
						}]
					}
				}]
			},
			"variableUsages": {
				"upc": {
					"kind": "VariableDefinition",
					"variable": {
						"kind": "Variable",
						"name": {
							"kind": "Name",
							"value": "upc"
						}
					},
					"type": {
						"kind": "NonNullType",
						"type": {
							"kind": "NamedType",
							"name": {
								"kind": "Name",
								"value": "String"
							}
						}
					},
					"directives": []
				},
				"body": {
					"kind": "VariableDefinition",
					"variable": {
						"kind": "Variable",
						"name": {
							"kind": "Name",
							"value": "body"
						}
					},
					"type": {
						"kind": "NonNullType",
						"type": {
							"kind": "NamedType",
							"name": {
								"kind": "Name",
								"value": "String"
							}
						}
					},
					"directives": []
				},
				"updatedReview": {
					"kind": "VariableDefinition",
					"variable": {
						"kind": "Variable",
						"name": {
							"kind": "Name",
							"value": "updatedReview"
						}
					},
					"type": {
						"kind": "NonNullType",
						"type": {
							"kind": "NamedType",
							"name": {
								"kind": "Name",
								"value": "UpdateReviewInput"
							}
						}
					},
					"directives": []
				}
			},
			"internalFragments": {},
			"operation": "mutation($upc:String!$body:String!$updatedReview:UpdateReviewInput!){reviewProduct(upc:$upc body:$body){__typename ...on Furniture{upc}}updateReview(review:$updatedReview){id body}}"
		}, {
			"kind": "Fetch",
			"serviceName": "accounts",
			"selectionSet": {
				"kind": "SelectionSet",
				"selections": [{
					"kind": "Field",
					"name": {
						"kind": "Name",
						"value": "login"
					},
					"arguments": [{
						"kind": "Argument",
						"name": {
							"kind": "Name",
							"value": "username"
						},
						"value": {
							"kind": "Variable",
							"name": {
								"kind": "Name",
								"value": "username"
							}
						}
					}, {
						"kind": "Argument",
						"name": {
							"kind": "Name",
							"value": "password"
						},
						"value": {
							"kind": "Variable",
							"name": {
								"kind": "Name",
								"value": "password"
							}
						}
					}],
					"directives": [],
					"selectionSet": {
						"kind": "SelectionSet",
						"selections": [{
							"kind": "Field",
							"name": {
								"kind": "Name",
								"value": "__typename"
							}
						}, {
							"kind": "Field",
							"name": {
								"kind": "Name",
								"value": "id",
								"loc": {
									"start": 8,
									"end": 10
								}
							},
							"arguments": [],
							"directives": [],
							"loc": {
								"start": 8,
								"end": 10
							}
						}]
					}
				}]
			},
			"variableUsages": {
				"username": {
					"kind": "VariableDefinition",
					"variable": {
						"kind": "Variable",
						"name": {
							"kind": "Name",
							"value": "username"
						}
					},
					"type": {
						"kind": "NonNullType",
						"type": {
							"kind": "NamedType",
							"name": {
								"kind": "Name",
								"value": "String"
							}
						}
					},
					"directives": []
				},
				"password": {
					"kind": "VariableDefinition",
					"variable": {
						"kind": "Variable",
						"name": {
							"kind": "Name",
							"value": "password"
						}
					},
					"type": {
						"kind": "NonNullType",
						"type": {
							"kind": "NamedType",
							"name": {
								"kind": "Name",
								"value": "String"
							}
						}
					},
					"directives": []
				}
			},
			"internalFragments": {},
			"operation": "mutation($username:String!$password:String!){login(username:$username password:$password){__typename id}}"
		}, {
			"kind": "Flatten",
			"path": ["login"],
			"node": {
				"kind": "Fetch",
				"serviceName": "reviews",
				"selectionSet": {
					"kind": "SelectionSet",
					"selections": [{
						"kind": "InlineFragment",
						"typeCondition": {
							"kind": "NamedType",
							"name": {
								"kind": "Name",
								"value": "User"
							}
						},
						"selectionSet": {
							"kind": "SelectionSet",
							"selections": [{
								"kind": "Field",
								"name": {
									"kind": "Name",
									"value": "reviews"
								},
								"arguments": [],
								"directives": [],
								"selectionSet": {
									"kind": "SelectionSet",
									"selections": [{
										"kind": "Field",
										"name": {
											"kind": "Name",
											"value": "product"
										},
										"arguments": [],
										"directives": [],
										"selectionSet": {
											"kind": "SelectionSet",
											"selections": [{
												"kind": "Field",
												"name": {
													"kind": "Name",
													"value": "__typename"
												}
											}, {
												"kind": "InlineFragment",
												"typeCondition": {
													"kind": "NamedType",
													"name": {
														"kind": "Name",
														"value": "Book"
													}
												},
												"selectionSet": {
													"kind": "SelectionSet",
													"selections": [{
														"kind": "Field",
														"name": {
															"kind": "Name",
															"value": "__typename"
														}
													}, {
														"kind": "Field",
														"name": {
															"kind": "Name",
															"value": "isbn",
															"loc": {
																"start": 8,
																"end": 12
															}
														},
														"arguments": [],
														"directives": [],
														"loc": {
															"start": 8,
															"end": 12
														}
													}]
												}
											}, {
												"kind": "InlineFragment",
												"typeCondition": {
													"kind": "NamedType",
													"name": {
														"kind": "Name",
														"value": "OutdoorFootball"
													}
												},
												"selectionSet": {
													"kind": "SelectionSet",
													"selections": [{
														"kind": "Field",
														"name": {
															"kind": "Name",
															"value": "upc"
														},
														"arguments": [],
														"directives": []
													}]
												}
											}, {
												"kind": "InlineFragment",
												"typeCondition": {
													"kind": "NamedType",
													"name": {
														"kind": "Name",
														"value": "IndoorFootball"
													}
												},
												"selectionSet": {
													"kind": "SelectionSet",
													"selections": [{
														"kind": "Field",
														"name": {
															"kind": "Name",
															"value": "upc"
														},
														"arguments": [],
														"directives": []
													}]
												}
											}, {
												"kind": "InlineFragment",
												"typeCondition": {
													"kind": "NamedType",
													"name": {
														"kind": "Name",
														"value": "Furniture"
													}
												},
												"selectionSet": {
													"kind": "SelectionSet",
													"selections": [{
														"kind": "Field",
														"name": {
															"kind": "Name",
															"value": "upc"
														},
														"arguments": [],
														"directives": []
													}]
												}
											}, {
												"kind": "InlineFragment",
												"typeCondition": {
													"kind": "NamedType",
													"name": {
														"kind": "Name",
														"value": "NightFootball"
													}
												},
												"selectionSet": {
													"kind": "SelectionSet",
													"selections": [{
														"kind": "Field",
														"name": {
															"kind": "Name",
															"value": "upc"
														},
														"arguments": [],
														"directives": []
													}]
												}
											}, {
												"kind": "InlineFragment",
												"typeCondition": {
													"kind": "NamedType",
													"name": {
														"kind": "Name",
														"value": "VisuallyImpairedFootball"
													}
												},
												"selectionSet": {
													"kind": "SelectionSet",
													"selections": [{
														"kind": "Field",
														"name": {
															"kind": "Name",
															"value": "upc"
														},
														"arguments": [],
														"directives": []
													}]
												}
											}]
										}
									}]
								}
							}]
						}
					}]
				},
				"variableUsages": {},
				"internalFragments": {},
				"requires": [{
					"kind": "InlineFragment",
					"typeCondition": "User",
					"selections": [{
						"kind": "Field",
						"name": "__typename"
					}, {
						"kind": "Field",
						"name": "id"
					}]
				}],
				"operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on OutdoorFootball{upc}...on IndoorFootball{upc}...on Furniture{upc}...on NightFootball{upc}...on VisuallyImpairedFootball{upc}}}}}}"
			}
		}, {
			"kind": "Flatten",
			"path": ["login", "reviews", "@", "product"],
			"node": {
				"kind": "Fetch",
				"serviceName": "product",
				"selectionSet": {
					"kind": "SelectionSet",
					"selections": [{
						"kind": "InlineFragment",
						"typeCondition": {
							"kind": "NamedType",
							"name": {
								"kind": "Name",
								"value": "Book"
							}
						},
						"selectionSet": {
							"kind": "SelectionSet",
							"selections": [{
								"kind": "Field",
								"name": {
									"kind": "Name",
									"value": "upc"
								},
								"arguments": [],
								"directives": []
							}]
						}
					}]
				},
				"variableUsages": {},
				"internalFragments": {},
				"requires": [{
					"kind": "InlineFragment",
					"typeCondition": "Book",
					"selections": [{
						"kind": "Field",
						"name": "__typename"
					}, {
						"kind": "Field",
						"name": "isbn"
					}]
				}],
				"operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}"
			}
		}, {
			"kind": "Fetch",
			"serviceName": "reviews",
			"selectionSet": {
				"kind": "SelectionSet",
				"selections": [{
					"kind": "Field",
					"name": {
						"kind": "Name",
						"value": "deleteReview"
					},
					"arguments": [{
						"kind": "Argument",
						"name": {
							"kind": "Name",
							"value": "id"
						},
						"value": {
							"kind": "Variable",
							"name": {
								"kind": "Name",
								"value": "reviewId"
							}
						}
					}],
					"directives": []
				}]
			},
			"variableUsages": {
				"reviewId": {
					"kind": "VariableDefinition",
					"variable": {
						"kind": "Variable",
						"name": {
							"kind": "Name",
							"value": "reviewId"
						}
					},
					"type": {
						"kind": "NonNullType",
						"type": {
							"kind": "NamedType",
							"name": {
								"kind": "Name",
								"value": "ID"
							}
						}
					},
					"directives": []
				}
			},
			"internalFragments": {},
			"operation": "mutation($reviewId:ID!){deleteReview(id:$reviewId)}"
		}]
	}
}
  """
